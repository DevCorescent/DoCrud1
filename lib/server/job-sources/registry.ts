/**
 * The source registry.
 *
 * Every ingestion source the platform knows about, as DATA. Adding a company's
 * ATS board is an environment change; adding a new KIND of source is one
 * adapter factory here. Neither requires touching the runner.
 *
 * The adapters DELEGATE. `fetchAshby`, `fetchLever` and `fetchGreenhouse`
 * already work, are already SSRF-guarded to a fixed host, and are already
 * covered by tests — so this file wraps them rather than reimplementing them.
 * A second fetch path would be a second set of bugs.
 */
import { allSources } from '@/lib/server/job-scraper/sources';
import { fetchAshby } from '@/lib/server/job-scraper/providers/ashby';
import { fetchLever } from '@/lib/server/job-scraper/providers/lever';
import { fetchGreenhouse } from '@/lib/server/job-scraper/providers/greenhouse';
import { fetchWorkday } from '@/lib/server/job-scraper/providers/workday';
import { fetchSmartRecruiters } from '@/lib/server/job-scraper/providers/smartrecruiters';
import { fetchWorkable } from '@/lib/server/job-scraper/providers/workable';
import { fetchRecruitee } from '@/lib/server/job-scraper/providers/recruitee';
import { fetchPersonio } from '@/lib/server/job-scraper/providers/personio';
import { fetchBambooHr } from '@/lib/server/job-scraper/providers/bamboohr';
import { fetchMicrosoftPaged } from '@/lib/server/job-scraper/providers/microsoft';
import type { ProviderDeps, ScrapeSource } from '@/lib/server/job-scraper/types';
import {
  DEFAULT_SOURCE_CONFIG,
  type JobSourceAdapter,
  type SourceAccessType,
  type SourceConfig,
  type SourceFetchResult,
  type SourceHealthReport,
} from './types';

/* ── Sources that may NOT be fetched ──────────────────────────────────────
   Registered deliberately, and never called.

   The Phase 0 audit established that each of these requires an API agreement
   or a partnership, and that their terms or robots.txt forbid the access this
   platform would otherwise need. Listing them here means the admin console can
   show WHY a well-known board is absent, instead of leaving someone to wonder
   whether it was forgotten and re-add it by scraping.

   `fetch()` on these throws. That is not a limitation to work around; it is
   the enforcement. */
const PARTNERSHIP_ONLY: Array<{ sourceId: string; name: string; note: string }> = [
  { sourceId: 'linkedin', name: 'LinkedIn', note: 'Requires the official Talent/Jobs API partnership.' },
  { sourceId: 'naukri', name: 'Naukri', note: 'Requires a commercial API agreement.' },
  { sourceId: 'indeed', name: 'Indeed', note: 'Requires the Indeed Publisher/Employer API.' },
  { sourceId: 'glassdoor', name: 'Glassdoor', note: 'Requires a partner API agreement.' },
  { sourceId: 'internshala', name: 'Internshala', note: 'robots.txt disallows the job search and API paths.' },
  { sourceId: 'instahyre', name: 'Instahyre', note: 'Only an undocumented internal endpoint exists.' },
];

/** Which access type a configured provider represents. */
const PROVIDER_ACCESS: Record<string, SourceAccessType> = {
  ashby: 'public_ats',
  lever: 'public_ats',
  greenhouse: 'public_ats',
  /* Stage 3 — all public, unauthenticated board endpoints. */
  workday: 'public_ats',
  smartrecruiters: 'public_ats',
  workable: 'public_ats',
  recruitee: 'public_ats',
  personio: 'public_ats',
  bamboohr: 'public_ats',
  /* robots.txt on apply.careers.microsoft.com explicitly Allows /api/pcsx. */
  microsoft: 'public_ats',
  jsonld: 'sitemap_jsonld',
};

/**
 * Per-source operational overrides, from the environment.
 *
 * `JOB_SOURCE_CONFIG` holds `sourceId:key=value` pairs, comma separated:
 *
 *   lever:acme=minIntervalMs:2000;concurrency:2, ashby:beta=enabled:false
 *
 * Anything unspecified takes the default. Unknown keys are ignored rather than
 * rejected, so a typo cannot take the whole registry down.
 */
function parseOverrides(): Map<string, Partial<SourceConfig>> {
  const out = new Map<string, Partial<SourceConfig>>();
  const raw = process.env.JOB_SOURCE_CONFIG || '';
  for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const sourceId = entry.slice(0, eq).trim();
    const config: Partial<SourceConfig> = {};
    for (const pair of entry.slice(eq + 1).split(';')) {
      const [k, v] = pair.split(':').map((x) => (x ?? '').trim());
      if (!k) continue;
      if (k === 'enabled') config.enabled = v !== 'false';
      else if (k === 'minIntervalMs') config.minIntervalMs = Number(v) || undefined;
      else if (k === 'concurrency') config.concurrency = Number(v) || undefined;
      else if (k === 'timeoutMs') config.timeoutMs = Number(v) || undefined;
      else if (k === 'maxAttempts') config.maxAttempts = Number(v) || undefined;
      else if (k === 'disableAfterConsecutiveFailures') {
        config.disableAfterConsecutiveFailures = Number(v) || undefined;
      }
    }
    if (sourceId) out.set(sourceId, config);
  }
  return out;
}

/** Every source's configuration, defaults merged with any override. */
export function listSourceConfigs(): SourceConfig[] {
  const overrides = parseOverrides();
  const configs: SourceConfig[] = [];

  for (const source of allSources()) {
    const accessType = PROVIDER_ACCESS[source.provider ?? 'jsonld'] ?? 'sitemap_jsonld';
    configs.push({
      ...DEFAULT_SOURCE_CONFIG,
      sourceId: source.name,
      name: source.label || source.name,
      accessType,
      /* The existing per-source enable flag still wins: an override can turn a
         source OFF, never silently on. */
      enabled: source.enabled,
      country: source.country,
      ...overrides.get(source.name),
      ...(source.enabled ? {} : { enabled: false }),
    });
  }

  for (const blocked of PARTNERSHIP_ONLY) {
    configs.push({
      ...DEFAULT_SOURCE_CONFIG,
      sourceId: blocked.sourceId,
      name: blocked.name,
      accessType: 'requires_partnership',
      /* Never enabled, and an override cannot enable it - see below. */
      enabled: false,
    });
  }

  return configs;
}

export function getSourceConfig(sourceId: string): SourceConfig | null {
  return listSourceConfigs().find((c) => c.sourceId === sourceId) ?? null;
}

/** The human explanation for a partnership-blocked source. */
export function partnershipNote(sourceId: string): string | null {
  return PARTNERSHIP_ONLY.find((p) => p.sourceId === sourceId)?.note ?? null;
}

/** True when this source must never be fetched, whatever the configuration. */
export function isPartnershipBlocked(sourceId: string): boolean {
  return PARTNERSHIP_ONLY.some((p) => p.sourceId === sourceId);
}

/* ── Adapters ─────────────────────────────────────────────────────────────*/

function providerAdapter(source: ScrapeSource, deps: ProviderDeps): JobSourceAdapter {
  const provider = source.provider ?? 'jsonld';

  const fetchJobs = async (cursor: string | null = null): Promise<SourceFetchResult> => {
    /* These three providers each return a company's whole open board in one
       response, so there is nothing to page through. The cursor is part of the
       CONTRACT rather than of these adapters: a paginated source added later
       returns a real token and the runner already stores it. */
    if (provider === 'ashby') return { jobs: await fetchAshby(source, deps), nextCursor: null };
    if (provider === 'lever') return { jobs: await fetchLever(source, deps), nextCursor: null };
    if (provider === 'greenhouse') {
      return { jobs: await fetchGreenhouse(source, deps), nextCursor: null };
    }
    /* Stage 3. Workday and SmartRecruiters paginate INTERNALLY and return a
       complete board, so the cursor stays null here too — the contract is
       "one call, every posting", not "one page". */
    if (provider === 'workday') return { jobs: await fetchWorkday(source, deps), nextCursor: null };
    if (provider === 'smartrecruiters') return { jobs: await fetchSmartRecruiters(source, deps), nextCursor: null };
    if (provider === 'workable') return { jobs: await fetchWorkable(source, deps), nextCursor: null };
    if (provider === 'recruitee') return { jobs: await fetchRecruitee(source, deps), nextCursor: null };
    if (provider === 'personio') return { jobs: await fetchPersonio(source, deps), nextCursor: null };
    if (provider === 'bamboohr') return { jobs: await fetchBambooHr(source, deps), nextCursor: null };

    /* The FIRST provider to use the cursor half of the contract.
       Microsoft's page size is fixed at 10 by their server, so the corpus is
       hundreds of requests and cannot be read in one bounded run. The adapter
       reads a bounded slice and hands back the page to resume at; `null` means
       it reached the end and the next run starts from the top. */
    if (provider === 'microsoft') {
      const startPage = Number(cursor);
      const out = await fetchMicrosoftPaged(source, deps, {
        startPage: Number.isFinite(startPage) && startPage > 0 ? startPage : 0,
      });
      return {
        jobs: out.jobs,
        nextCursor: out.nextPage === null ? null : String(out.nextPage),
      };
    }
    throw new Error(`No adapter for provider "${provider}".`);
  };

  return {
    sourceId: source.name,
    name: source.label || source.name,
    accessType: PROVIDER_ACCESS[provider] ?? 'sitemap_jsonld',
    host: source.host,
    fetch: fetchJobs,
    async healthCheck(): Promise<SourceHealthReport> {
      /* A health check IS a fetch for these providers - the board endpoint is
         the only thing to ask. Reusing it means health cannot drift away from
         what ingestion actually does. */
      try {
        const { jobs } = await fetchJobs();
        return { ok: true, detail: `${jobs.length} posting(s) reachable` };
      } catch (error) {
        return { ok: false, detail: safeMessage(error) };
      }
    },
  };
}

/** An adapter that refuses, for a source the platform may not fetch. */
function blockedAdapter(sourceId: string, name: string, note: string): JobSourceAdapter {
  const refuse = () => {
    throw new Error(`${name} cannot be ingested: ${note}`);
  };
  return {
    sourceId,
    name,
    accessType: 'requires_partnership',
    host: '',
    fetch: async () => refuse(),
    healthCheck: async () => ({ ok: false, detail: note }),
  };
}

/** Every adapter, blocked ones included so the console can list them. */
export function listAdapters(deps: ProviderDeps = {}): JobSourceAdapter[] {
  const adapters = allSources().map((s) => providerAdapter(s, deps));
  for (const b of PARTNERSHIP_ONLY) {
    adapters.push(blockedAdapter(b.sourceId, b.name, b.note));
  }
  return adapters;
}

export function getAdapter(sourceId: string, deps: ProviderDeps = {}): JobSourceAdapter | null {
  return listAdapters(deps).find((a) => a.sourceId === sourceId) ?? null;
}

/** A message safe to store and show. Never a stack, never a credential. */
export function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
}
