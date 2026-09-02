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
import {
  getScraperState, saveScraperState,
  type ScraperRunSummary, type ScraperSourceState,
} from '@/lib/server/job-scraper/state';
import { resolveCompanyLogos } from '@/lib/server/company-logo-resolver';
import { logoKey } from '@/lib/company-logos';
import { getHomepageConfig } from '@/lib/server/homepage-config';
import { importJobsFromCsv } from '@/lib/server/job-import';
import type { SourceRunStat } from '@/lib/server/job-scraper/types';

export interface SourceInfo {
  name: string;
  label: string;
  provider: string;
  /** Canonical company identity — the same id Company Explorer and /jobs/company use. */
  companyId: string;
  /** '' when no trustworthy logo exists. The UI then renders initials. */
  logoUrl: string;
  /**
   * The company's own website, ONLY when an operator configured one.
   *
   * Never derived from the job's applyUrl — that host is the ATS
   * (boards.greenhouse.io, jobs.lever.co), not the employer — and never guessed
   * from the display name. Absent means "not configured", which the UI states
   * plainly rather than filling in.
   */
  websiteUrl: string;
  enabled: boolean;
  lastSyncAt?: string;
  jobs?: number;
  failed?: boolean;
  /* Admin diagnostics: why a source is failing, and for how long. Safe strings
     only — a host and a status, never a URL, a credential or a stack. */
  lastAttemptAt?: string;
  lastError?: string;
  lastErrorKind?: string;
  lastErrorStatus?: number;
  consecutiveFailures?: number;
}

export interface ScraperStatus {
  mode: 'internal' | 'unconfigured';
  configured: boolean;
  sourceNames: string[];
  sources: SourceInfo[];
  lastRun: ScraperRunSummary | null;
}

/** Websites an operator configured, keyed by canonical company identity. */
function websiteFor(map: Map<string, string>, name: string): string | undefined {
  return map.get(logoKey(name));
}

export async function getScraperStatus(): Promise<ScraperStatus> {
  /* Operator-supplied websites are the ONLY domain source in the system — no
     ATS provider reports one, and a domain is never derived from a name. */
  const configuredWebsites = await getHomepageConfig()
    .then((c) => new Map(
      c.companyExplorer.items
        .filter((i) => i.websiteUrl)
        .map((i) => [i.id, i.websiteUrl as string]),
    ))
    .catch(() => new Map<string, string>());

  const enabled = listSources();
  const state = await getScraperState().catch(() => ({}));
  const perSource = (state as { perSource?: Record<string, ScraperSourceState> }).perSource ?? {};
  const all = allSources();

  /* ONE resolution per COMPANY, not per source row and never per job.
     22 configured sources produce at most 22 company-level lookups, and a warm
     cache produces none. Two sources for one employer collapse to one entry.

     Best effort: a resolver failure yields an empty logoUrl and the row renders
     initials. Scraper status must never depend on a logo host being reachable. */
  const logos = await resolveCompanyLogos(
    all.map((s) => ({
      name: s.label || s.name,
      websiteUrl: websiteFor(configuredWebsites, s.label || s.name),
    })),
  ).catch(() => new Map());

  const sources: SourceInfo[] = all.map((s) => ({
    name: s.name,
    label: s.label || s.name,
    provider: s.provider ?? 'jsonld',
    companyId: logoKey(s.label || s.name),
    /* Independent of sync state: a source that has never synced can still have
       a perfectly good logo. "Not synced" is a SCRAPER fact, not a brand one. */
    logoUrl: logos.get(logoKey(s.label || s.name))?.logoUrl ?? '',
    websiteUrl: websiteFor(configuredWebsites, s.label || s.name) ?? '',
    enabled: s.enabled,
    lastSyncAt: perSource[s.name]?.lastSyncAt,
    jobs: perSource[s.name]?.jobs,
    failed: perSource[s.name]?.failed,
    lastAttemptAt: perSource[s.name]?.lastAttemptAt,
    lastError: perSource[s.name]?.lastError,
    lastErrorKind: perSource[s.name]?.lastErrorKind,
    lastErrorStatus: perSource[s.name]?.lastErrorStatus,
    consecutiveFailures: perSource[s.name]?.consecutiveFailures,
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
  /** Sources that completed without error. Distinct from `failed`. */
  sourcesOk: number;
  fetched: number;
  valid: number;
  duplicates: number;
  imported: number;
  rejected: number;
  failed: number;
  /**
   * Truthful write breakdown. `discovered` is what the sources returned;
   * everything else describes what happened in the database. They are never
   * the same number, and conflating them is what made a fully up-to-date board
   * read as a failed run.
   */
  discovered: number;
  inserted: number;
  updated: number;
  unchanged: number;
  contentChanged: number;
  existingUnknown: number;
  duplicateInRun: number;
  /** Unique jobs dropped because the run hit its cap. */
  truncated: number;
  perSource: SourceRunStat[];
  runAt: string;
}

/**
 * LEGACY PATH — insert-only.
 *
 * Kept because the CSV preview/commit screens still use `importJobsFromCsv`
 * directly, and removing it would break an admin tool this stage was not asked
 * to touch. It can only INSERT: a posting whose source content changed is
 * recognised and skipped, which is what made a fully up-to-date board report
 * "0 imported" forever.
 *
 * The scraper dashboard no longer calls this — see `runCanonicalIngest` below.
 */
export async function runApprovedAndImport(opts: { totalLimit?: number; adminEmail: string }): Promise<ScrapeSummary> {
  if (listSources().length === 0) throw new Error('No approved scraper sources are configured.');

  const out = await runApprovedScrape({ totalLimit: opts.totalLimit });

  let imported = 0, valid = 0, existingDupes = 0, importInvalid = 0, updated = 0;
  let breakdown = { inserted: 0, duplicateInRun: 0, unchanged: 0, contentChanged: 0, existingUnknown: 0 };
  if (out.csv && out.jobs.length > 0) {
    const summary = await importJobsFromCsv(out.csv, { commit: true, adminEmail: opts.adminEmail });
    imported = summary.imported;
    valid = summary.valid;
    existingDupes = summary.duplicates;
    importInvalid = summary.invalid;
    updated = summary.updated;
    breakdown = summary.breakdown;
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
    sourcesOk: out.perSource.filter((s) => !s.failed).length,
    fetched: out.fetched,
    valid,
    duplicates,
    imported,
    rejected,
    failed: out.failed,
    /* `discovered` is the count of jobs the sources actually returned and that
       survived validation — NOT the number written. */
    discovered: out.active,
    inserted: breakdown.inserted,
    updated,
    unchanged: breakdown.unchanged,
    contentChanged: breakdown.contentChanged,
    existingUnknown: breakdown.existingUnknown,
    duplicateInRun: breakdown.duplicateInRun + out.duplicates,
    truncated: out.truncated,
    perSource: out.perSource,
    runAt,
  };
}


/* ── Stage 2: the canonical ingestion path ────────────────────────────────*/

/**
 * Run the canonical pipeline and return a summary in the SAME shape the
 * dashboard already reads.
 *
 * This is the adapter between the admin screen and
 * lib/server/job-sources/run-ingestion.ts. It adds no ingestion logic; it only
 * maps the canonical run's totals onto `ScrapeSummary` so the existing UI keeps
 * working, and records last-run state through the same storage the old path
 * used.
 *
 * `imported` is mapped from INSERTED, and `updated` is now a real number
 * rather than a permanent zero — that is the whole point of the switch.
 */
export async function runCanonicalIngest(opts: { totalLimit?: number }): Promise<ScrapeSummary> {
  const { runCanonicalIngestion } = await import('./job-sources/run-ingestion');
  const out = await runCanonicalIngestion({ perSourceLimit: opts.totalLimit });

  const perSource: SourceRunStat[] = out.perSource.map((s) => ({
    name: s.name,
    /* The registry's sourceId is "provider:board"; the leading segment IS the
       provider. Narrowed against the known set rather than cast, so an
       unrecognised prefix degrades to 'jsonld' instead of lying about type. */
    provider: (['ashby', 'lever', 'greenhouse', 'workday', 'smartrecruiters',
      'workable', 'recruitee', 'personio', 'bamboohr', 'jsonld'] as const)
      .find((p) => p === s.sourceId.split(':')[0]) ?? 'jsonld',
    fetched: s.discovered,
    active: s.inserted + s.updated + s.unchanged,
    failed: !s.ok,
    ...(s.error ? { error: s.error } : {}),
  }));

  const prev = await getScraperState().catch(() => ({}));
  const perSourceMap: Record<string, ScraperSourceState> = {
    ...((prev as { perSource?: Record<string, ScraperSourceState> }).perSource ?? {}),
  };
  for (const s of out.perSource) {
    /* A source that was never attempted is left exactly as it was. */
    if (s.skipped) continue;

    const before = perSourceMap[s.name];
    if (!s.ok) {
      /* THE FIX. Failures used to `continue` here, so `failed: true` was never
         written and the console's red dot could not light up — a source that
         failed every run showed as "Not synced" forever, indistinguishable
         from one that had simply never been configured.

         `lastSyncAt` and `jobs` KEEP their previous values: the last successful
         read is a fact, and overwriting it would claim a sync that never
         happened. Only the failure fields move. */
      perSourceMap[s.name] = {
        ...before,
        jobs: before?.jobs ?? 0,
        failed: true,
        lastAttemptAt: out.runAt,
        lastError: s.error ?? 'Source failed.',
        lastErrorKind: s.errorKind,
        lastErrorStatus: s.errorStatus,
        consecutiveFailures: (before?.consecutiveFailures ?? 0) + 1,
      };
      continue;
    }

    /* A SUCCESSFUL run — including one that legitimately found zero jobs —
       clears the failure state. `jobs: 0` with `failed: false` is a real and
       meaningful answer: the board was read and has no openings. */
    perSourceMap[s.name] = {
      lastSyncAt: out.runAt,
      jobs: s.discovered,
      failed: false,
      lastAttemptAt: out.runAt,
      consecutiveFailures: 0,
    };
  }

  const summary: ScrapeSummary = {
    sources: out.sources,
    sourcesOk: out.sourcesOk,
    fetched: out.discovered,
    valid: out.discovered,
    duplicates: out.duplicateInRun + out.unchanged,
    imported: out.inserted,
    rejected: out.rejected,
    failed: out.failed,
    discovered: out.discovered,
    inserted: out.inserted,
    updated: out.updated,
    unchanged: out.unchanged,
    /* The canonical path UPDATES changed jobs, so nothing is left stale. The
       field stays in the shape for the legacy path, and is zero here. */
    contentChanged: 0,
    existingUnknown: 0,
    duplicateInRun: out.duplicateInRun,
    truncated: out.truncated,
    perSource,
    runAt: out.runAt,
  };

  await saveScraperState({
    lastRun: {
      runAt: out.runAt, fetched: out.discovered, valid: out.discovered,
      duplicates: summary.duplicates, imported: out.inserted,
      rejected: out.rejected, failed: out.failed,
      discovered: out.discovered, inserted: out.inserted, updated: out.updated,
      unchanged: out.unchanged, duplicateInRun: out.duplicateInRun,
      truncated: out.truncated, sourcesOk: out.sourcesOk,
    },
    perSource: perSourceMap,
  }).catch(() => {});

  return summary;
}
